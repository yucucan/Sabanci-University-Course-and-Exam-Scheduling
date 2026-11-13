'use strict';

const scheduleComparisonKey = STORAGE_KEY + '-schedule-comparison-v1';
let scheduleReview = null;
let scheduleComparison = null;
try { scheduleComparison = JSON.parse(localStorage.getItem(scheduleComparisonKey)); } catch (_) {}

function inspectWorkspace(workspace, inspect) {
  const current = data;
  data = workspace;
  try { return inspect(); } finally { data = current; }
}

function placement(session) {
  const {day, start, end, classroom} = session;
  return {day, start, end, classroom};
}

function placementText(session) {
  const time = isScheduled(session) ? `${session.day} ${session.start}–${session.end}` : 'Unscheduled';
  return `${time} · ${session.classroom || 'No room'}`;
}

function configuredBlocks(duration) {
  const blocks = [];
  const standard = usesSabanciBlocks();
  for (const day of days) {
    const slots = data.timeStructure.filter(s => s.day === day && (!standard || teachingBlockCount(s.start,s.end)===1)).sort((a, b) => a.start.localeCompare(b.start));
    for (let i = 0; i < slots.length; i++) {
      for (let j = i; j < Math.min(slots.length,i+3); j++) {
        if (j > i && minutes(slots[j].start) - minutes(slots[j - 1].end) !== 10) break;
        const span = minutes(slots[j].end) - minutes(slots[i].start);
        if (span === duration) blocks.push({day:day.toUpperCase(), start:slots[i].start, end:slots[j].end});
        if (span >= duration) break;
      }
    }
  }
  return blocks;
}

function unplacedMeetingDuration(session) {
  const pattern=session.kind==='Lab'?session.pattern:data.courses[session.courseIndex].patterns;
  for(const alternative of String(pattern||'').split(',')){
    const parts=alternative.trim().split('+');
    if(parts.every(part=>/^[0-3]$/.test(part.trim()))){
      const first=parts.map(Number).find(Boolean);
      if(first)return first*60-10;
    }
  }
  return 110;
}

function issueIdentity(issue) {
  return JSON.stringify([issue.courseIndex, issue.title, issue.description]);
}

function buildScheduleReview(stage, seatWeight) {
  const baseline = clone(data);
  const candidate = clone(data);
  const before = computeScheduleMetrics();
  const originalSessions = allSessions();
  const changes = [];
  const evaluationLimit = 4500;
  const deadline = performance.now() + 3000;
  let evaluations = 0;
  const limitReached = () => evaluations >= evaluationLimit || performance.now() >= deadline;

  const issues = inspectWorkspace(candidate, () => {
    const byDuration = new Map();
    const issuesBefore = scheduleIssues();
    const affected = new Set(issuesBefore.map(issue => issue.courseIndex));
    const orderedSessions = [...originalSessions].sort((a, b) => Number(affected.has(b.courseIndex)) - Number(affected.has(a.courseIndex)));
    let findings = issuesBefore;
    for (let pass = 0; pass < 2; pass++) {
      for (const session of orderedSessions) {
        if (limitReached()) return findings;
        const record = sessionRecord(candidate, session);
        const previous = placement(record);
        const isPlaced = isScheduled(record);
        if (!isPlaced && !record.instructor) continue;
        if (!isPlaced && (stage === 'postreg' || record.fixedTime === true)) continue;
        const room = data.classrooms.find(r => r.code === previous.classroom);
        const department = data.courses[session.courseIndex].department;
        const requirement = session.kind === 'Lab' ? room?.type : data.courses[session.courseIndex].classRequirements;
        const requiredType = data.classroomTypes.some(t => t.name === requirement) ? requirement : '';
        const allowedRooms = data.classrooms.filter(r => r.capacity >= session.demand && (!requiredType || r.type === requiredType));
        const timeLocked = stage === 'postreg' || record.fixedTime === true;
        const duration = isPlaced ? minutes(record.end) - minutes(record.start) : unplacedMeetingDuration(session);
        if (!timeLocked && !byDuration.has(duration)) byDuration.set(duration, configuredBlocks(duration));
        const slots = isPlaced ? [{day:previous.day, start:previous.start, end:previous.end}] : [];
        if (!timeLocked) slots.push(...byDuration.get(duration));
        const existingHard = new Set(findings.filter(i => i.severity === 'error').map(issueIdentity));
        const score = (placement, selectedRoom, checks) => {
          const movedTime = placement.day !== session.day || placement.start !== session.start || placement.end !== session.end;
          const affinity = data.buildingScores.find(r => r.department === department && r.building === selectedRoom?.building)?.score ?? 0;
          const seatFit = selectedRoom ? session.demand / selectedRoom.capacity * 100 : 0;
          const ranking = -(seatFit * seatWeight + affinity * (100 - seatWeight));
          const movedRoom = Number(placement.classroom !== session.classroom);
          const preferences = stage === 'review' ? [Number(movedTime), movedRoom, ranking] : [ranking, Number(movedTime), movedRoom];
          return [checks.filter(i => i.severity === 'error').length, Number(!isScheduled(placement)), checks.length, ...preferences];
        };
        let best = previous, bestFindings = findings, bestScore = score(previous, room, findings);
        for (const slot of slots) {
          for (const candidateRoom of allowedRooms) {
            if (limitReached()) break;
            const next = {...slot, classroom:candidateRoom.code};
            if (JSON.stringify(next) === JSON.stringify(previous)) continue;
            Object.assign(record, next);
            evaluations++;
            const checks = scheduleIssues();
            if (checks.some(i => i.severity === 'error' && !existingHard.has(issueIdentity(i)))) continue;
            const nextScore = score(next, candidateRoom, checks);
            const firstDifference = nextScore.findIndex((value, index) => value !== bestScore[index]);
            if (firstDifference !== -1 && nextScore[firstDifference] < bestScore[firstDifference]) {
              best = next; bestScore = nextScore; bestFindings = checks;
            }
          }
          if (limitReached()) break;
        }
        Object.assign(record, best);
        findings = bestFindings;
      }
    }
    return findings;
  });

  for (const session of originalSessions) {
    const next = sessionRecord(candidate, session);
    if (JSON.stringify(placement(session)) === JSON.stringify(placement(next))) continue;
    const oldRoom = baseline.classrooms.find(room => room.code === session.classroom);
    const reason = !isScheduled(session) ? 'Assign an open time and room' :
      oldRoom && oldRoom.capacity < session.demand ? 'Meet section capacity' :
      session.day !== next.day || session.start !== next.start ? 'Reduce schedule conflicts' : 'Improve room fit or resolve a room conflict';
    changes.push({name:sessionLabel(session), course:session.course, before:placementText(session), after:placementText(next), reason});
  }
  const after = inspectWorkspace(candidate, computeScheduleMetrics);
  return {baseline:JSON.stringify(baseline), candidate, changes, issues, before, after, limitReached:limitReached()};
}

function applyScheduleReview() {
  if (!scheduleReview?.changes.length) return;
  if (scheduleReview.baseline !== JSON.stringify(data)) {
    scheduleReview = null;
    render();
    notify('The schedule changed since this review. Generate a new candidate.');
    return;
  }
  const {candidate, before, after, changes} = scheduleReview;
  checkpoint();
  data = candidate;
  const saved = persist();
  scheduleComparison = {before, after, changes, appliedAt:new Date().toISOString()};
  if (saved) try { localStorage.setItem(scheduleComparisonKey, JSON.stringify(scheduleComparison)); } catch (_) {}
  scheduleReview = null;
  render();
  notify(saved ? 'Schedule changes applied. Use Undo to restore the previous schedule.' : 'Schedule changes applied for this session. Export data to keep them.');
}

function planningSubnav(active) {
  return `<div class="view-switch" role="navigation" aria-label="Schedule planning">${[
    ['planning','planning','Schedule review'], ['counterfactual','planning/counterfactual','Capacity comparison'],
    ['session','planning/session','Room comparison']
  ].map(([key, route, name]) => `<a ${active===key?'class="selected" aria-current="page"':''} href="#${route}">${name}</a>`).join('')}</div>`;
}

function scheduleReviewPage() {
  const sessions = allSessions();
  const metrics = computeScheduleMetrics();
  const review = scheduleReview;
  const fresh = review?.baseline === JSON.stringify(data);
  const issueCount = review?.issues.length ?? 0;
  main.innerHTML = heading('Schedule review','Generate candidate placements and review the changes before applying them.') + planningSubnav('planning') +
    statCards([
      ['Active sections and labs',sessions.length,`${metrics.unplacedSessions} awaiting a time`],
      ['Schedule errors',metrics.hardErrors,'Review the current schedule before changing assignments'],
      ['Booked seat fill',`${metrics.seatFillPct}%`,`${metrics.wastedSeatHours} unused seat-hours`]
    ]) +
    `<section class="panel"><div class="section-heading"><h2>Placement settings</h2><button type="button" data-open-spreadsheets>Spreadsheet import and export</button></div><div class="panel-content">
      <div class="form-grid"><label>Planning stage<select id="schedule-stage">${[
        ['initial','Initial placement'],['review','Faculty review'],['postreg','Room changes after registration']
      ].map(([value,label])=>`<option value="${value}" ${scheduleSettings.stage===value?'selected':''}>${label}</option>`).join('')}</select></label>
      <label>Seat fit weight (%)<input id="schedule-seat-weight" type="number" min="0" max="100" step="1" value="${scheduleSettings.seatWeight}"></label></div>
      <p>Fixed times stay in place. Room changes after registration preserve every meeting time. The search preserves meeting lengths and uses the first part of an available pattern for an unplaced meeting. Add the remaining meetings in the section editor.</p>
      <p>Seat fit and building preference rank suitable rooms. The search evaluates individual session moves within the configured teaching blocks.</p>
      <div class="toolbar"><button class="primary" type="button" data-generate-schedule>Generate candidate schedule</button><button type="button" data-export-schedule-csv>Export current schedule CSV</button></div>
    </div></section>` +
    (review ? `<section class="panel" id="schedule-changes" tabindex="-1"><div class="section-heading"><h2>Review schedule changes</h2><span>${review.changes.length} changed · ${issueCount} findings remain</span></div><div class="panel-content">
      <p>${fresh?'Review the candidate against your current schedule.':'The current schedule has changed. Generate a new candidate to continue.'} ${review.limitReached?'The search reached its evaluation limit.':''}</p>
      ${review.changes.length ? `<div class="table-wrap"><table><thead><tr><th>Section</th><th>Current placement</th><th>Candidate placement</th><th>Reason</th></tr></thead><tbody>${review.changes.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.before)}</td><td>${esc(c.after)}</td><td>${esc(c.reason)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No improving placements were found within the current settings.</p>'}
      <h3>Remaining findings</h3>${issueCount ? issueCards(review.issues) : '<p>The candidate passes the schedule checks.</p>'}
      <div class="toolbar"><button class="primary" type="button" data-apply-schedule-review ${fresh&&review.changes.length?'':'disabled'}>Apply reviewed changes</button><button type="button" data-discard-schedule-review>Discard candidate</button></div>
    </div></section>` : '') +
    `<section class="panel"><div class="section-heading"><h2>Current placements</h2><a class="text-link" href="#timetable">Open timetable →</a></div><div class="panel-content"><div class="table-wrap"><table><thead><tr><th>Section</th><th>Placement</th><th>Demand</th><th>Time lock</th></tr></thead><tbody>${sessions.map(s=>`<tr><td><a href="#courses/edit/${s.courseIndex}" class="text-link">${esc(sessionLabel(s))}</a></td><td>${esc(placementText(s))}</td><td>${s.demand}</td><td><button type="button" aria-pressed="${s.fixedTime===true}" data-pin-session="${esc(sessionKey(s))}">${s.fixedTime===true?'Fixed time':'Movable'}</button></td></tr>`).join('')}</tbody></table></div></div></section>` +
    panel('Practice scenario','<p>Load a separate set of records with capacity, travel, and placement conflicts to practice reviewing changes. Use Undo to recover your current workspace.</p><button type="button" data-trigger-demo-scenario>Load conflict scenario</button>');
  main.querySelector('#schedule-stage').onchange = event => {
    scheduleSettings.stage = event.target.value;
    scheduleReview = null;
    render();
  };
  main.querySelector('#schedule-seat-weight').onchange = event => {
    const weight = event.target.valueAsNumber;
    if (!Number.isInteger(weight) || weight < 0 || weight > 100) {
      event.target.value = scheduleSettings.seatWeight;
      notify('Enter a whole percentage from 0 to 100.');
      return;
    }
    scheduleSettings.seatWeight = weight;
    scheduleReview = null;
    render();
  };
}

function generateScheduleCandidate() {
  scheduleReview = buildScheduleReview(scheduleSettings.stage, scheduleSettings.seatWeight);
  if (currentRoute() !== 'planning') location.hash = 'planning';
  render();
  main.querySelector('#schedule-changes')?.focus();
}

function roomTypeCapacity(slots) {
  const sessionsInScope = scheduledSessions().filter(session=>slots.some(slot=>
    slot.day.toUpperCase()===session.day && overlaps(minutes(slot.start),minutes(slot.end),minutes(session.start),minutes(session.end))));
  return data.classroomTypes.map(type => {
    const rooms = data.classrooms.filter(room => room.type === type.name);
    let roomMinutes = 0, seatMinutes = 0;
    for (const room of rooms) {
      const dayEnds = new Map();
      for (const slot of slots) {
        if (!roomWindow(room, slot.day.toUpperCase(), slot.start, slot.end).free) continue;
        const start = Math.max(minutes(slot.start), dayEnds.get(slot.day) || 0);
        const end = minutes(slot.end);
        const freeMinutes = Math.max(0, end - start);
        dayEnds.set(slot.day, Math.max(start,end));
        roomMinutes += freeMinutes;
        seatMinutes += freeMinutes * room.capacity;
      }
    }
    const sessions = sessionsInScope.filter(session => rooms.some(room => room.code === session.classroom));
    const additionalSeats = sessions.reduce((total,session) => {
      const room = rooms.find(room => room.code === session.classroom);
      return total + Math.max(0, Math.ceil(session.demand * (100 + scheduleSettings.surgePercent) / 100) - room.capacity);
    },0);
    return {type:type.name, rooms:rooms.length, roomHours:Math.round(roomMinutes/6)/10, seatHours:Math.round(seatMinutes/60), additionalSeats};
  });
}

function counterfactualPage() {
  const current = computeScheduleMetrics();
  const comparison = scheduleComparison;
  const metrics = [
    ['Booked seat fill','seatFillPct','%'],['Unused booked capacity','wastedSeatHours',' seat-hours'],
    ['Sections over capacity','overflowSections',''],['Unplaced sessions','unplacedSessions',''],
    ['Travel and turnaround findings','travelViolations',''],['Cohort and rule findings','cohortClashes',''],
    ['Building preference score','avgBuildingScore',' / 100']
  ];
  const daySlots = data.timeStructure.filter(slot=>!scheduleSettings.capacityDay || slot.day===scheduleSettings.capacityDay);
  const slotOptions = [...new Set(daySlots.map(slot=>`${slot.start}–${slot.end}`))].sort();
  if (!slotOptions.includes(scheduleSettings.capacitySlot)) scheduleSettings.capacitySlot = '';
  const slots = daySlots.filter(slot=>!scheduleSettings.capacitySlot || `${slot.start}–${slot.end}`===scheduleSettings.capacitySlot)
    .sort((a,b)=>a.start.localeCompare(b.start));
  const capacities = roomTypeCapacity(slots);
  main.innerHTML = heading('Capacity comparison','Review saved schedule results and room availability for the current timetable.') + planningSubnav('counterfactual') +
    `<section class="panel"><div class="section-heading"><h2>Schedule measurements</h2></div><div class="panel-content">
      ${comparison?`<p>Last applied comparison · ${esc(new Date(comparison.appliedAt).toLocaleDateString())}. The current column reflects subsequent edits and Undo.</p>`:'<p>Apply a reviewed schedule to save its before and after measurements here.</p>'}
      <div class="table-wrap"><table><thead><tr><th>Measure</th>${comparison?'<th>Before changes</th><th>After changes</th>':''}<th>Current schedule</th></tr></thead><tbody>${metrics.map(([label,key,unit])=>`<tr><th scope="row">${label}</th>${comparison?`<td>${esc(comparison.before[key])}${unit}</td><td>${esc(comparison.after[key])}${unit}</td>`:''}<td>${current[key]}${unit}</td></tr>`).join('')}</tbody></table></div></div></section>` +
    `<section class="panel"><div class="section-heading"><h2>Available capacity by room type</h2></div><div class="panel-content"><p>Counts configured time blocks that are free of bookings and room unavailability. Seat-hours measure seat capacity over time.</p>
      <div class="form-grid">${selectControl('capacity-day','Day',days,scheduleSettings.capacityDay,'All days')}${selectControl('capacity-slot','Time block',slotOptions,scheduleSettings.capacitySlot,'All configured blocks')}</div>
      <label>Demand increase per scheduled session (%)<input id="cf-surge-slider" type="range" min="0" max="50" step="5" value="${scheduleSettings.surgePercent}"><output id="cf-surge-value">${scheduleSettings.surgePercent}%</output></label>
      <p>The shortfall shows the additional seats needed in currently assigned rooms during the selected blocks. Review room changes separately.</p>
      <div class="table-wrap"><table><thead><tr><th>Room type</th><th>Rooms</th><th>Free room-hours</th><th>Free seat-hours</th><th>Seat shortfall at this demand</th></tr></thead><tbody>${capacities.map(r=>`<tr><th scope="row">${esc(r.type)}</th><td>${r.rooms}</td><td>${r.roomHours}</td><td>${r.seatHours}</td><td>${r.additionalSeats}</td></tr>`).join('')}</tbody></table></div>
    </div></section>`;
  const slider = main.querySelector('#cf-surge-slider');
  slider.oninput = () => { main.querySelector('#cf-surge-value').value = `${slider.value}%`; };
  slider.onchange = () => { scheduleSettings.surgePercent = Number(slider.value); counterfactualPage(); main.querySelector('#cf-surge-slider').focus(); };
  for (const [id,key] of [['capacity-day','capacityDay'],['capacity-slot','capacitySlot']]) {
    main.querySelector(`#${id}`).onchange = event => {
      scheduleSettings[key] = event.target.value;
      counterfactualPage();
      main.querySelector(`#${id}`).focus();
    };
  }
}
